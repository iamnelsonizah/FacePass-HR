"""Geofence validation service for FacePass.

Uses the Haversine formula to compute distances between GPS coordinates
and validate whether a user is within a site's geofence radius.
"""

import math


# Earth's radius in meters
EARTH_RADIUS_METERS = 6_371_000


def haversine_distance(
    lat1: float, lon1: float, lat2: float, lon2: float
) -> float:
    """Calculate the great-circle distance between two GPS coordinates.

    Args:
        lat1: Latitude of point 1 (degrees).
        lon1: Longitude of point 1 (degrees).
        lat2: Latitude of point 2 (degrees).
        lon2: Longitude of point 2 (degrees).

    Returns:
        Distance in meters.
    """
    lat1_rad = math.radians(lat1)
    lat2_rad = math.radians(lat2)
    delta_lat = math.radians(lat2 - lat1)
    delta_lon = math.radians(lon2 - lon1)

    a = (
        math.sin(delta_lat / 2) ** 2
        + math.cos(lat1_rad) * math.cos(lat2_rad) * math.sin(delta_lon / 2) ** 2
    )
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))

    return EARTH_RADIUS_METERS * c


def validate_geofence(
    user_lat: float,
    user_lon: float,
    site_lat: float,
    site_lon: float,
    radius_meters: float,
) -> tuple[bool, float]:
    """Check if a user's location is within a site's geofence.

    Args:
        user_lat: User's latitude.
        user_lon: User's longitude.
        site_lat: Site center latitude.
        site_lon: Site center longitude.
        radius_meters: Geofence radius in meters.

    Returns:
        Tuple of (is_within_geofence, distance_in_meters).
    """
    distance = haversine_distance(user_lat, user_lon, site_lat, site_lon)
    is_within = distance <= radius_meters
    return (is_within, round(distance, 2))


def find_nearest_site(
    user_lat: float,
    user_lon: float,
    sites: list[dict],
) -> dict | None:
    """Find the nearest site to the user's location that they're within.

    Args:
        user_lat: User's latitude.
        user_lon: User's longitude.
        sites: List of site dicts with 'latitude', 'longitude', 'radius_meters'.

    Returns:
        The nearest site dict the user is within, or None.
    """
    nearest = None
    min_distance = float("inf")

    for site in sites:
        is_within, distance = validate_geofence(
            user_lat,
            user_lon,
            site["latitude"],
            site["longitude"],
            site["radius_meters"],
        )
        if is_within and distance < min_distance:
            min_distance = distance
            nearest = {**site, "distance_meters": distance}

    return nearest
