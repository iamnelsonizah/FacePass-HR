import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Image,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { getMyAttendanceHistory } from "../services/api";
import EmptyTimesheetIllustration from "./EmptyTimesheetIllustration";

interface AttendanceItem {
  id: string;
  check_type: "check_in" | "check_out" | string;
  checked_at: string;
  trust_score: number;
  status: "verified" | "flagged" | "rejected" | string;
  geofence_distance_meters?: number;
  flag_reason?: string;
  sites?: {
    name: string;
  };
}

interface TimesheetHistoryProps {
  onClose: () => void;
  userProfile?: {
    first_name?: string;
    last_name?: string;
    employee_code?: string;
    avatar_url?: string | null;
  };
}

export default function TimesheetHistory({ onClose, userProfile }: TimesheetHistoryProps) {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [historyData, setHistoryData] = useState<{
    employee_name: string;
    employee_code?: string;
    verified_rate: number;
    total_punches: number;
    logs: AttendanceItem[];
  } | null>(null);

  const loadHistory = async () => {
    try {
      const data = await getMyAttendanceHistory(30);
      setHistoryData(data);
    } catch (err) {
      console.warn("Could not load attendance history:", err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadHistory();
  }, []);

  const onRefresh = () => {
    setRefreshing(true);
    loadHistory();
  };

  // Profile data resolution
  const resolvedName =
    userProfile?.first_name || userProfile?.last_name
      ? `${userProfile.first_name || ""} ${userProfile.last_name || ""}`.trim()
      : historyData?.employee_name || "Team Member";

  const resolvedCode =
    userProfile?.employee_code || historyData?.employee_code || "";

  const initials =
    resolvedName
      .split(" ")
      .filter(Boolean)
      .map((part) => part[0])
      .join("")
      .toUpperCase()
      .slice(0, 2) || "FP";

  const verifiedRate = historyData?.verified_rate ?? 100;

  const renderItem = ({ item }: { item: AttendanceItem }) => {
    const isCheckIn = item.check_type === "check_in";
    const dateObj = new Date(item.checked_at);
    const timeStr = dateObj.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    const dateStr = dateObj.toLocaleDateString([], {
      month: "short",
      day: "numeric",
      weekday: "short",
    });

    const isVerified = item.status === "verified";
    const trustColor = item.trust_score >= 80 ? "#16A34A" : item.trust_score >= 50 ? "#D97706" : "#DC2626";

    return (
      <View style={styles.card}>
        <View style={styles.cardLeft}>
          <View
            style={[
              styles.typeBadge,
              isCheckIn ? styles.typeBadgeIn : styles.typeBadgeOut,
            ]}
          >
            <Ionicons
              name={isCheckIn ? "arrow-down" : "arrow-up"}
              size={18}
              color={isCheckIn ? "#059669" : "#2563EB"}
            />
          </View>
          <View>
            <Text style={styles.siteText}>
              {item.sites?.name || "Main Site"}
            </Text>
            <Text style={styles.dateText}>{dateStr} • {timeStr}</Text>
            {item.flag_reason ? (
              <Text style={styles.flagReasonText}>⚠️ {item.flag_reason}</Text>
            ) : null}
          </View>
        </View>

        <View style={styles.cardRight}>
          <View
            style={[
              styles.statusBadge,
              isVerified ? styles.statusBadgeVerified : styles.statusBadgeFlagged,
            ]}
          >
            <Text
              style={[
                styles.statusText,
                isVerified ? styles.statusTextVerified : styles.statusTextFlagged,
              ]}
            >
              {isVerified ? "Verified" : "Flagged"}
            </Text>
          </View>
          <Text style={[styles.trustScoreText, { color: trustColor }]}>
            {item.trust_score}% Trust
          </Text>
        </View>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      {/* Top Header Bar */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={onClose}
          style={styles.closeButton}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          activeOpacity={0.7}
        >
          <Ionicons name="close" size={24} color="#1E293B" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>My Timesheet</Text>
        <View style={styles.headerRightSpace} />
      </View>

      {/* Profile Header Summary */}
      <View style={styles.profileSection}>
        <View style={styles.profileLeft}>
          {userProfile?.avatar_url ? (
            <Image
              source={{ uri: userProfile.avatar_url }}
              style={styles.avatarImage}
            />
          ) : (
            <View style={styles.avatarInitials}>
              <Text style={styles.avatarInitialsText}>{initials}</Text>
            </View>
          )}

          <View style={styles.profileTextGroup}>
            <Text style={styles.profileName}>{resolvedName}</Text>
            <Text style={styles.profileCode}>{resolvedCode}</Text>
          </View>
        </View>

        {/* Verified Rate Pill */}
        <View style={styles.ratePill}>
          <View style={styles.rateTopRow}>
            <Ionicons name="shield-checkmark" size={15} color="#059669" />
            <Text style={styles.rateValue}>{verifiedRate}%</Text>
          </View>
          <Text style={styles.rateLabel}>VERIFIED RATE</Text>
        </View>
      </View>

      {/* Content Area */}
      {loading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color="#2563EB" />
          <Text style={styles.loadingText}>Loading punch history...</Text>
        </View>
      ) : (
        <FlatList
          data={historyData?.logs || []}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={[
            styles.listContent,
            (!historyData?.logs || historyData.logs.length === 0) &&
              styles.emptyListContent,
          ]}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <EmptyTimesheetIllustration />
              <Text style={styles.emptyTitle}>No Attendance Records Yet</Text>
              <Text style={styles.emptySub}>
                Your check-ins and check-outs will appear
here once you start logging your time.
              </Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#FFFFFF",
  },

  // Top Header Bar
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#F1F5F9",
    backgroundColor: "#FFFFFF",
  },
  closeButton: {
    width: 32,
    height: 32,
    alignItems: "flex-start",
    justifyContent: "center",
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#0F172A",
    textAlign: "center",
    flex: 1,
    letterSpacing: -0.3,
  },
  headerRightSpace: {
    width: 32,
  },

  // Profile Section
  profileSection: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 18,
    borderBottomWidth: 1,
    borderBottomColor: "#F1F5F9",
    backgroundColor: "#FFFFFF",
  },
  profileLeft: {
    flexDirection: "row",
    alignItems: "center",
  },
  avatarInitials: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: "#0B3B2C",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarInitialsText: {
    color: "#FFFFFF",
    fontSize: 18,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  avatarImage: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: "#E2E8F0",
  },
  profileTextGroup: {
    marginLeft: 14,
  },
  profileName: {
    fontSize: 18,
    fontWeight: "800",
    color: "#0F172A",
    letterSpacing: -0.3,
  },
  profileCode: {
    fontSize: 13,
    color: "#64748B",
    fontWeight: "500",
    marginTop: 3,
  },

  // Verified Rate Pill
  ratePill: {
    backgroundColor: "#ECFDF5",
    borderWidth: 1,
    borderColor: "#D1FAE5",
    borderRadius: 12,
    paddingVertical: 7,
    paddingHorizontal: 14,
    alignItems: "center",
  },
  rateTopRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  rateValue: {
    fontSize: 15,
    fontWeight: "800",
    color: "#059669",
  },
  rateLabel: {
    fontSize: 9.5,
    fontWeight: "800",
    color: "#059669",
    letterSpacing: 0.6,
    marginTop: 2,
  },

  // List & Cards
  listContent: {
    padding: 16,
    paddingBottom: 40,
  },
  emptyListContent: {
    flexGrow: 1,
    justifyContent: "center",
    paddingBottom: 100,
  },
  card: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#FFFFFF",
    padding: 14,
    borderRadius: 16,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 6,
    elevation: 1,
  },
  cardLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    flex: 1,
  },
  typeBadge: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  typeBadgeIn: {
    backgroundColor: "#ECFDF5",
    borderWidth: 1,
    borderColor: "#A7F3D0",
  },
  typeBadgeOut: {
    backgroundColor: "#EFF6FF",
    borderWidth: 1,
    borderColor: "#BFDBFE",
  },
  siteText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#0F172A",
  },
  dateText: {
    fontSize: 12,
    color: "#64748B",
    marginTop: 2,
  },
  flagReasonText: {
    fontSize: 11,
    color: "#DC2626",
    marginTop: 3,
  },
  cardRight: {
    alignItems: "flex-end",
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    marginBottom: 4,
  },
  statusBadgeVerified: {
    backgroundColor: "#ECFDF5",
  },
  statusBadgeFlagged: {
    backgroundColor: "#FEF3C7",
  },
  statusText: {
    fontSize: 11,
    fontWeight: "700",
  },
  statusTextVerified: {
    color: "#059669",
  },
  statusTextFlagged: {
    color: "#D97706",
  },
  trustScoreText: {
    fontSize: 12,
    fontWeight: "600",
  },
  centerContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 30,
  },
  loadingText: {
    color: "#64748B",
    marginTop: 10,
    fontSize: 14,
    fontWeight: "500",
  },

  // Empty State
  emptyContainer: {
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
    paddingTop: 40,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: "#0F172A",
    textAlign: "center",
    marginTop: 26,
    letterSpacing: -0.3,
  },
  emptySub: {
    fontSize: 14,
    color: "#64748B",
    textAlign: "center",
    marginTop: 8,
    lineHeight: 21,
  },
});
