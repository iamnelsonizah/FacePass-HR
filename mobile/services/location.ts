import * as Location from "expo-location";

/**
 * Request location permissions from the user.
 * Returns true if granted, false otherwise.
 */
export async function requestLocationPermission(): Promise<boolean> {
  const { status } = await Location.requestForegroundPermissionsAsync();
  return status === "granted";
}

/**
 * Get the current device location.
 */
export async function getCurrentLocation(): Promise<{
  latitude: number;
  longitude: number;
  accuracy: number | null;
}> {
  const hasPermission = await requestLocationPermission();
  if (!hasPermission) {
    throw new Error("Location permission not granted");
  }

  const location = await Location.getCurrentPositionAsync({
    accuracy: Location.Accuracy.High,
  });

  return {
    latitude: location.coords.latitude,
    longitude: location.coords.longitude,
    accuracy: location.coords.accuracy,
  };
}

/**
 * Calculate Haversine distance between two coordinates (in meters).
 */
export function calculateDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371000; // Earth radius in meters
  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(lat1)) *
      Math.cos(toRadians(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}

/**
 * Check if user is within a site's geofence.
 */
export function isWithinGeofence(
  userLat: number,
  userLon: number,
  siteLat: number,
  siteLon: number,
  radiusMeters: number
): boolean {
  const distance = calculateDistance(userLat, userLon, siteLat, siteLon);
  return distance <= radiusMeters;
}

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

/**
 * Reverse geocode latitude and longitude to get human-readable location name and city.
 */
export async function getPlaceName(
  latitude: number,
  longitude: number
): Promise<{ siteName: string; siteCity: string }> {
  try {
    const results = await Location.reverseGeocodeAsync({ latitude, longitude });
    if (results && results.length > 0) {
      const item = results[0];
      let siteName = item.name || item.street || item.district || "Current Location";
      if (item.name && item.street && item.name !== item.street) {
        if (/^\d+/.test(item.name)) {
          siteName = `${item.name} ${item.street}`;
        } else {
          siteName = item.name;
        }
      } else if (item.street) {
        siteName = item.street;
      }

      const parts = [
        item.city || item.subregion || item.district,
        item.region || item.country,
      ].filter(Boolean);
      const siteCity =
        parts.length > 0 ? parts.join(", ") : "Detected Location";
      return { siteName, siteCity };
    }
  } catch (err) {
    console.warn("Reverse geocode failed:", err);
  }
  return { siteName: "Current Worksite", siteCity: "GPS Verified" };
}
