// Matches the webapp's feed video upload limit exactly (SphereApp.js,
// the composer's uploadVideoChunked call: maxDurationSeconds:300,
// maxSizeBytes:200*1024*1024). The webapp's Reels feature has its own,
// separate (and stricter) limit, but native doesn't have a reel-creation
// flow — only feed posts and now DM/group video messages — so both of
// those use this one flat limit, applied the same way in both places.
export const VIDEO_MAX_DURATION_SECONDS = 300; // 5 minutes
export const VIDEO_MAX_SIZE_BYTES = 200 * 1024 * 1024; // 200MB

export type VideoAssetInfo = { duration?: number | null; fileSize?: number | null };

// Returns an error message if the picked video breaks a limit, or null if
// it's fine to upload. expo-image-picker reports `duration` in
// milliseconds; `fileSize` isn't always available on every platform (most
// reliably present on Android), so a missing value is treated as "can't
// tell, don't block" rather than a false rejection.
export function checkVideoLimits(asset: VideoAssetInfo): string | null {
  if (asset.duration != null) {
    const seconds = asset.duration / 1000;
    if (seconds > VIDEO_MAX_DURATION_SECONDS) {
      return `This video is ${Math.round(seconds)}s long — the limit is ${VIDEO_MAX_DURATION_SECONDS / 60} minutes.`;
    }
  }
  if (asset.fileSize != null) {
    if (asset.fileSize > VIDEO_MAX_SIZE_BYTES) {
      return `This file is ${(asset.fileSize / 1024 / 1024).toFixed(1)}MB — the limit is ${VIDEO_MAX_SIZE_BYTES / 1024 / 1024}MB.`;
    }
  }
  return null;
}
