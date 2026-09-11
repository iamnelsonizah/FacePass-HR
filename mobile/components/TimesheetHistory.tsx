import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
} from "react-native";
import { getMyAttendanceHistory } from "../services/api";

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
}

export default function TimesheetHistory({ onClose }: TimesheetHistoryProps) {
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
            <Text style={styles.typeText}>{isCheckIn ? "IN" : "OUT"}</Text>
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
      {/* Header Bar */}
      <View style={styles.header}>
        <TouchableOpacity onPress={onClose} style={styles.closeButton}>
          <Text style={styles.closeText}>✕ Close</Text>
        </TouchableOpacity>
        <Text style={styles.title}>My Timesheet</Text>
        <View style={{ width: 60 }} />
      </View>

      {/* Summary Banner */}
      {historyData && (
        <View style={styles.summaryCard}>
          <View>
            <Text style={styles.employeeName}>{historyData.employee_name}</Text>
            <Text style={styles.employeeCode}>{historyData.employee_code || "Staff ID"}</Text>
          </View>
          <View style={styles.ratePill}>
            <Text style={styles.rateNumber}>{historyData.verified_rate}%</Text>
            <Text style={styles.rateLabel}>Verified Rate</Text>
          </View>
        </View>
      )}

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
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyEmoji}>📋</Text>
              <Text style={styles.emptyTitle}>No Attendance Records Yet</Text>
              <Text style={styles.emptySub}>
                Your check-ins and check-outs will appear here.
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
    backgroundColor: "#F9FAFB",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 14,
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
  },
  closeButton: {
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  closeText: {
    color: "#4B5563",
    fontSize: 15,
    fontWeight: "600",
  },
  title: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#111827",
  },
  summaryCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#EFF6FF",
    marginHorizontal: 16,
    marginTop: 14,
    marginBottom: 8,
    padding: 16,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#BFDBFE",
  },
  employeeName: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#1E3A8A",
  },
  employeeCode: {
    fontSize: 13,
    color: "#3B82F6",
    marginTop: 2,
  },
  ratePill: {
    backgroundColor: "#fff",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 12,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#DBEAFE",
  },
  rateNumber: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#16A34A",
  },
  rateLabel: {
    fontSize: 10,
    color: "#6B7280",
    textTransform: "uppercase",
  },
  listContent: {
    padding: 16,
    paddingBottom: 40,
  },
  card: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#fff",
    padding: 14,
    borderRadius: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 2,
    elevation: 1,
  },
  cardLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    flex: 1,
  },
  typeBadge: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
  },
  typeBadgeIn: {
    backgroundColor: "#DCFCE7",
  },
  typeBadgeOut: {
    backgroundColor: "#FEE2E2",
  },
  typeText: {
    fontSize: 12,
    fontWeight: "bold",
    color: "#111827",
  },
  siteText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#111827",
  },
  dateText: {
    fontSize: 12,
    color: "#6B7280",
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
    backgroundColor: "#DCFCE7",
  },
  statusBadgeFlagged: {
    backgroundColor: "#FEF3C7",
  },
  statusText: {
    fontSize: 11,
    fontWeight: "600",
  },
  statusTextVerified: {
    color: "#15803D",
  },
  statusTextFlagged: {
    color: "#B45309",
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
    color: "#6B7280",
    marginTop: 10,
    fontSize: 14,
  },
  emptyContainer: {
    paddingTop: 60,
    alignItems: "center",
  },
  emptyEmoji: {
    fontSize: 48,
    marginBottom: 12,
  },
  emptyTitle: {
    fontSize: 17,
    fontWeight: "bold",
    color: "#374151",
  },
  emptySub: {
    fontSize: 13,
    color: "#9CA3AF",
    marginTop: 4,
    textAlign: "center",
  },
});
