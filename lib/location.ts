import * as Location from 'expo-location';

// Foreground-only, on purpose — no background location tracking anywhere
// in this file. Right now this powers login history (an approximate
// location recorded with each sign-in) and new-device login alerts.
// content recommendations and people-to-follow suggestions are meant to
// build on this same helper later, not a new location system.
export type LocationSnapshot = { latitude: number; longitude: number; city: string | null; region: string | null };

export async function ensureForegroundLocationPermission(): Promise<boolean> {
  const { status } = await Location.getForegroundPermissionsAsync();
  if (status === 'granted') return true;
  const { status: requested } = await Location.requestForegroundPermissionsAsync();
  return requested === 'granted';
}

export async function getForegroundLocation(): Promise<LocationSnapshot | null> {
  try {
    const granted = await ensureForegroundLocationPermission();
    if (!granted) return null;
    // Accuracy.Low is plenty for "which city" and resolves faster with
    // less battery draw than a precise GPS fix — nothing here needs
    // street-level precision.
    const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Low });
    let city: string | null = null;
    let region: string | null = null;
    try {
      const places = await Location.reverseGeocodeAsync({ latitude: pos.coords.latitude, longitude: pos.coords.longitude });
      city = places?.[0]?.city || places?.[0]?.subregion || null;
      region = places?.[0]?.region || null;
    } catch (err) {
      // Reverse geocoding can fail (offline, rate-limited, etc.) even
      // when the raw coordinates succeeded — the coordinates are still
      // useful on their own, so this doesn't fail the whole call.
      console.warn('[Location] reverse geocode failed:', err);
    }
    return { latitude: pos.coords.latitude, longitude: pos.coords.longitude, city, region };
  } catch (err) {
    console.warn('[Location] failed to get current position:', err);
    return null;
  }
}
