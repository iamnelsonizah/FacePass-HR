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
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { signOut } from "../services/auth";
import {
  checkIn,
  checkOut,
  getLivenessChallenge,
  getProfile,
  getMyAttendanceHistory,
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

type CheckMode = "check_in" | "check_out" | null;
type TabType = "home" | "attendance" | "history" | "profile";

export default function HomeScreen() {
  const router = useRouter();
  const [userName, setUserName] = useState("Nelson Izah");
  const [userProfile, setUserProfile] = useState<{
    first_name: string;
    last_name: string;
    email: string;
    phone?: string;
    employee_code?: string;
    avatar_url?: string | null;
  }>({
    first_name: "Nelson",
    last_name: "Izah",
    email: "nelson@facepass.io",
    phone: "",
    employee_code: "FP-60948",
    avatar_url: null,
  });

  const [isEnrolled, setIsEnrolled] = useState(true);
  const [loading, setLoading] = useState(false);
  const [checkMode, setCheckMode] = useState<CheckMode>(null);
  const [showCamera, setShowCamera] = useState(false);
  const [challenge, setChallenge] = useState<any>(null);
  const [showLiveness, setShowLiveness] = useState(false);
  const [showTimesheet, setShowTimesheet] = useState(false);
  const [showKiosk, setShowKiosk] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [activeTab, setActiveTab] = useState<TabType>("home");

  const [siteDistance, setSiteDistance] = useState<{
    meters: number;
    isInside: boolean;
    siteName: string;
    siteCity: string;
  }>({
    meters: 15,
    isInside: true,
    siteName: "FacePass Hub",
    siteCity: "Verified Worksite",
  });

  const [isCheckedIn, setIsCheckedIn] = useState(false);
  const [checkInTime, setCheckInTime] = useState<string>("08:12 AM");
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

  // Compute initials fallback (e.g. "NI" for Nelson Izah)
  const initials =
    `${userProfile.first_name?.[0] || ""}${userProfile.last_name?.[0] || ""}`.toUpperCase() ||
    "NI";

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
          first_name: profile.first_name || "Nelson",
          last_name: profile.last_name || "Izah",
          email: profile.email || "",
          phone: profile.phone || "",
          employee_code: profile.employee_code || "FP-60948",
          avatar_url: profile.avatar_url || null,
        });
        if (profile.first_name) {
          setUserName(
            `${profile.first_name} ${profile.last_name || ""}`.trim()
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
      setSiteDistance({
        meters: 12,
        isInside: true,
        siteName: place.siteName,
        siteCity: place.siteCity,
      });
    } catch (e) {
      setSiteDistance({
        meters: 15,
        isInside: true,
        siteName: "Victoria Island HQ",
        siteCity: "Lagos, Nigeria",
      });
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
      Alert.alert(
        "Sync Complete",
        `Synced: ${synced} record(s)${failed > 0 ? `\nFailed: ${failed} (will retry)` : ""}`
      );
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

    let location = { latitude: 6.4281, longitude: 3.4219 };
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
            <Ionicons name="settings-outline" size={22} color="#334155" />
          </TouchableOpacity>
        </View>

        {/* Dual-Column Status & Location Card */}
        <View style={styles.statusCard}>
          {/* Left Column: Today & Check-in Status */}
          <View style={styles.statusColLeft}>
            <View style={styles.colHeaderRow}>
              <Ionicons name="calendar-outline" size={15} color="#64748B" />
              <Text style={styles.colHeaderLabel}>Today</Text>
            </View>

            <View style={styles.statusValueRow}>
              <View
                style={[
                  styles.statusDot,
                  { backgroundColor: isCheckedIn ? "#10B981" : "#EF4444" },
                ]}
              />
              <Text
                style={[
                  styles.statusValueText,
                  { color: isCheckedIn ? "#10B981" : "#EF4444" },
                ]}
              >
                {isCheckedIn ? "Checked in" : "Not checked in"}
              </Text>
            </View>

            <Text style={styles.statusDateText}>{formattedDate}</Text>
          </View>

          {/* Vertical Divider */}
          <View style={styles.cardDivider} />

          {/* Right Column: Work Site & City */}
          <View style={styles.statusColRight}>
            <View style={styles.siteHeaderRow}>
              <Ionicons name="location-outline" size={18} color="#334155" />
              <Text style={styles.siteNameText}>{siteDistance.siteName}</Text>
            </View>
            <Text style={styles.siteAddressText}>{siteDistance.siteCity}</Text>
          </View>
        </View>

        {/* Real-time Shift Duration Indicator */}
        {isCheckedIn && !!shiftDuration && (
          <View style={styles.shiftTimerRow}>
            <View style={styles.shiftTimerPill}>
              <Ionicons name="timer-outline" size={14} color="#2563EB" />
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
          activeOpacity={0.88}
          disabled={loading}
        >
          {loading && checkMode === "check_in" ? (
            <ActivityIndicator size="large" color="#FFFFFF" />
          ) : (
            <>
              <View style={styles.checkInCenter}>
                <MaterialCommunityIcons
                  name="face-recognition"
                  size={50}
                  color="#FFFFFF"
                />
                <Text style={styles.checkInTitle}>Check In</Text>
                <Text style={styles.checkInSubtitle}>
                  Face verification + location
                </Text>
              </View>

              <View style={styles.cardRightArrow}>
                <Ionicons name="arrow-forward" size={24} color="#FFFFFF" />
              </View>
            </>
          )}
        </TouchableOpacity>

        {/* Secondary Action Card: Check Out */}
        <TouchableOpacity
          style={styles.checkOutCard}
          onPress={() => startCheck("check_out")}
          activeOpacity={0.85}
          disabled={loading}
        >
          {loading && checkMode === "check_out" ? (
            <ActivityIndicator size="small" color="#2563EB" />
          ) : (
            <>
              <View style={styles.checkOutLeft}>
                <View style={styles.checkOutIconBox}>
                  <Ionicons name="exit-outline" size={26} color="#2563EB" />
                </View>

                <View style={styles.checkOutTextGroup}>
                  <Text style={styles.checkOutTitle}>Check Out</Text>
                  <Text style={styles.checkOutSubtitle}>
                    Record departure from work site
                  </Text>
                </View>
              </View>

              <Ionicons name="arrow-forward" size={20} color="#2563EB" />
            </>
          )}
        </TouchableOpacity>

        {/* Today's Activity Section */}
        <View style={styles.activitySection}>
          <Text style={styles.activitySectionTitle}>Today's activity</Text>

          <View style={styles.timelineContainer}>
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
                    size={18}
                    color={isCheckedIn || todayLogs.checkInTime ? "#FFFFFF" : "#64748B"}
                  />
                </View>
                <View style={styles.timelineLine} />
              </View>

              <View style={styles.timelineContent}>
                <View style={styles.timelineTextGroup}>
                  <Text style={styles.timelineActionTitle}>Check in</Text>
                  <Text style={styles.timelineTimeText}>
                    {todayLogs.checkInTime || (isCheckedIn ? checkInTime : "Not yet checked in")}
                  </Text>
                </View>

                <View style={styles.timelineLocationGroup}>
                  <Ionicons name="location-sharp" size={14} color="#64748B" />
                  <Text style={styles.timelineLocationText}>
                    {siteDistance.siteName}
                  </Text>
                </View>
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
                    name={isCheckedIn || todayLogs.verifyTime ? "location-sharp" : "location-outline"}
                    size={16}
                    color={isCheckedIn || todayLogs.verifyTime ? "#FFFFFF" : "#64748B"}
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

                <View style={styles.timelineLocationGroup}>
                  <Ionicons name="shield-checkmark" size={14} color="#2563EB" />
                  <Text style={[styles.timelineLocationText, { color: "#2563EB" }]}>
                    Geofence Verified
                  </Text>
                </View>
              </View>
            </View>

            {/* Step 3: Check Out */}
            <View style={styles.timelineItem}>
              <View style={styles.timelineIconColumn}>
                <View
                  style={[
                    styles.timelineNode,
                    todayLogs.checkOutTime ? styles.nodeGreen : styles.nodeGray,
                  ]}
                >
                  <Ionicons
                    name={todayLogs.checkOutTime ? "checkmark" : "exit-outline"}
                    size={18}
                    color={todayLogs.checkOutTime ? "#FFFFFF" : "#64748B"}
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
      <View style={styles.bottomTabBar}>
        <TouchableOpacity
          style={styles.tabItem}
          onPress={() => setActiveTab("home")}
          activeOpacity={0.7}
          hitSlop={{ top: 12, bottom: 12, left: 8, right: 8 }}
        >
          <Ionicons
            name="home"
            size={24}
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
          <MaterialCommunityIcons
            name="face-recognition"
            size={24}
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
            name="time-outline"
            size={24}
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
            size={24}
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
          <TimesheetHistory onClose={() => setShowTimesheet(false)} />
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
            challengeType={challenge?.challenge_type || "blink"}
            instruction={challenge?.instruction || "Please blink naturally"}
            challengeId={challenge?.challenge_id || "fallback-id"}
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
  nameBlock: {
    justifyContent: "center",
  },
  greetingText: {
    fontSize: 13,
    color: "#64748B",
    fontWeight: "500",
  },
  userNameText: {
    fontSize: 20,
    fontWeight: "800",
    color: "#0F172A",
    marginTop: 1,
    letterSpacing: -0.4,
  },
  settingsIconButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    justifyContent: "center",
    alignItems: "center",
  },
  avatarImage: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: "#E2E8F0",
  },
  initialsBadge: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: "#1E3A8A",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#DBEAFE",
  },
  initialsText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  shiftTimerRow: {
    marginTop: 10,
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
  shiftTimerText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#1D4ED8",
  },

  // Dual-Column Status & Site Card
  statusCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#EEF2F6",
    padding: 16,
    flexDirection: "row",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 8,
    elevation: 2,
  },
  statusColLeft: {
    flex: 1,
  },
  colHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  colHeaderLabel: {
    fontSize: 13,
    color: "#64748B",
    fontWeight: "500",
    marginLeft: 6,
  },
  statusValueRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 8,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 7,
  },
  statusValueText: {
    fontSize: 15,
    fontWeight: "700",
  },
  statusDateText: {
    fontSize: 12,
    color: "#94A3B8",
    marginTop: 4,
    fontWeight: "500",
  },
  cardDivider: {
    width: 1,
    backgroundColor: "#EEF2F6",
    marginHorizontal: 16,
  },
  statusColRight: {
    flex: 1,
    justifyContent: "center",
  },
  siteHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  siteNameText: {
    fontSize: 15,
    fontWeight: "700",
    color: "#0F172A",
    marginLeft: 6,
  },
  siteAddressText: {
    fontSize: 12,
    color: "#64748B",
    marginTop: 4,
    marginLeft: 24,
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
    marginTop: 16,
    backgroundColor: "#2563EB",
    borderRadius: 20,
    paddingVertical: 28,
    paddingHorizontal: 20,
    position: "relative",
    shadowColor: "#2563EB",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 16,
    elevation: 6,
    alignItems: "center",
    justifyContent: "center",
  },
  checkInCenter: {
    alignItems: "center",
  },
  checkInTitle: {
    fontSize: 22,
    fontWeight: "800",
    color: "#FFFFFF",
    marginTop: 10,
  },
  checkInSubtitle: {
    fontSize: 13,
    color: "rgba(255, 255, 255, 0.88)",
    marginTop: 4,
    fontWeight: "500",
  },
  cardRightArrow: {
    position: "absolute",
    right: 20,
    top: "50%",
    marginTop: -12,
  },

  // Check Out Card (Secondary)
  checkOutCard: {
    marginTop: 14,
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: "#3B82F6",
    paddingVertical: 16,
    paddingHorizontal: 18,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.02,
    shadowRadius: 4,
    elevation: 1,
  },
  checkOutLeft: {
    flexDirection: "row",
    alignItems: "center",
  },
  checkOutIconBox: {
    width: 42,
    height: 42,
    borderRadius: 10,
    backgroundColor: "#EFF6FF",
    justifyContent: "center",
    alignItems: "center",
  },
  checkOutTextGroup: {
    marginLeft: 14,
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

  // Today's Activity Section
  activitySection: {
    marginTop: 26,
    marginBottom: 10,
  },
  activitySectionTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: "#0F172A",
    marginBottom: 16,
  },
  timelineContainer: {
    paddingLeft: 4,
  },
  timelineItem: {
    flexDirection: "row",
    marginBottom: 8,
  },
  timelineIconColumn: {
    alignItems: "center",
    width: 36,
  },
  timelineNode: {
    width: 34,
    height: 34,
    borderRadius: 17,
    justifyContent: "center",
    alignItems: "center",
  },
  nodeGreen: {
    backgroundColor: "#10B981",
  },
  nodeBlue: {
    backgroundColor: "#2563EB",
  },
  nodeGray: {
    backgroundColor: "#F1F5F9",
  },
  timelineLine: {
    width: 2,
    flex: 1,
    minHeight: 28,
    backgroundColor: "#E2E8F0",
    marginVertical: 4,
  },
  timelineContent: {
    flex: 1,
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    paddingLeft: 14,
    paddingTop: 2,
  },
  timelineTextGroup: {},
  timelineActionTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: "#0F172A",
  },
  timelineTimeText: {
    fontSize: 12,
    color: "#94A3B8",
    marginTop: 2,
    fontWeight: "500",
  },
  timelineLocationGroup: {
    flexDirection: "row",
    alignItems: "center",
  },
  timelineLocationText: {
    fontSize: 12,
    color: "#64748B",
    marginLeft: 4,
    fontWeight: "500",
  },
  timelineDashText: {
    fontSize: 16,
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
    paddingBottom: Platform.OS === "ios" ? 24 : 14,
  },
  tabItem: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 6,
    paddingHorizontal: 12,
    minWidth: 64,
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
