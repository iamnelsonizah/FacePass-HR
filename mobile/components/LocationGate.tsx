import React, { useEffect, useState } from "react";
import { View, Text, ActivityIndicator, StyleSheet } from "react-native";
import { getCurrentLocation, calculateDistance } from "../services/location";

interface LocationGateProps {
  siteLatitude?: number;
  siteLongitude?: number;
  radiusMeters?: number;
  onLocationVerified: (result: {
    isWithin: boolean;
    latitude: number;
    longitude: number;
    distance: number | null;
  }) => void;
  children: React.ReactNode;
}

/**
 * Geofence check wrapper component.
 *
 * Gets the current location on mount and checks if the user
 * is within the specified geofence. If no site is specified,
 * just passes through the location data.
 */
export default function LocationGate({
  siteLatitude,
  siteLongitude,
  radiusMeters = 100,
  onLocationVerified,
  children,
}: LocationGateProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isWithin, setIsWithin] = useState(false);
  const [distance, setDistance] = useState<number | null>(null);

  useEffect(() => {
    checkLocation();
  }, []);

  const checkLocation = async () => {
    try {
      setLoading(true);
      setError(null);

      const location = await getCurrentLocation();

      let within = true;
      let dist: number | null = null;

      if (siteLatitude !== undefined && siteLongitude !== undefined) {
        dist = calculateDistance(
          location.latitude,
          location.longitude,
          siteLatitude,
          siteLongitude
        );
        within = dist <= radiusMeters;
      }

      setIsWithin(within);
      setDistance(dist);

      onLocationVerified({
        isWithin: within,
        latitude: location.latitude,
        longitude: location.longitude,
        distance: dist,
      });
    } catch (err: any) {
      setError(err.message || "Failed to get location");
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color="#2563EB" />
        <Text style={styles.loadingText}>Checking your location...</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.container}>
        <Text style={styles.errorEmoji}>📍</Text>
        <Text style={styles.errorText}>{error}</Text>
        <Text style={styles.errorSubtext}>
          Please enable location services and try again
        </Text>
      </View>
    );
  }

  if (!isWithin && siteLatitude !== undefined) {
    return (
      <View style={styles.container}>
        <Text style={styles.errorEmoji}>🚫</Text>
        <Text style={styles.errorText}>Outside work zone</Text>
        <Text style={styles.errorSubtext}>
          You are {distance ? `${Math.round(distance)}m` : "too far"} from the
          work site. Please move closer to check in.
        </Text>
      </View>
    );
  }

  return <>{children}</>;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
    backgroundColor: "#f9fafb",
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: "#6B7280",
  },
  errorEmoji: {
    fontSize: 48,
    marginBottom: 16,
  },
  errorText: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#DC2626",
    textAlign: "center",
  },
  errorSubtext: {
    fontSize: 14,
    color: "#6B7280",
    textAlign: "center",
    marginTop: 8,
    paddingHorizontal: 40,
  },
});
