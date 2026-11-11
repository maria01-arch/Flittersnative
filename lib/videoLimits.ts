import { supabase } from './supabase';

// Rules (decided with the app owner):
//   - Over 5 minutes: rejected outright, for everyone.
//   - Regular members: up to 20 seconds.
//   - Verified members: up to 1 minute.
// Shorter videos mean smaller uploads, fewer pieces to stitch together on the
// server, and less storage and bandwidth — that is the point of the limits.
export const VIDEO_REJECT_ABOVE_SECONDS = 300; // 5 minutes
export const VIDEO_LIMIT_REGULAR_SECONDS = 20;
export const VIDEO_LIMIT_VERIFIED_SECONDS = 60;
export const VIDEO_MAX_SIZE_BYTES = 200 * 1024 * 1024; // 200MB

export type VideoAssetInfo = { duration?: number | null; fileSize?: number | null };

// Either badge counts: the blue "verified" tick or the gold "authentic" one.
export async function getVideoLimitSeconds(userId?: string | null): Promise<number> {
  if (!userId) return VIDEO_LIMIT_REGULAR_SECONDS;
  const { data } = await supabase.from('profiles').select('verified,is_authentic,verified_plan').eq('id', userId).maybeSingle();
  return data?.verified || data?.is_authentic ? VIDEO_LIMIT_VERIFIED_SECONDS : VIDEO_LIMIT_REGULAR_SECONDS;
}

// Returns an error message if the picked video breaks a rule, or null if it's
// fine to upload. expo-image-picker reports `duration` in milliseconds;
// `fileSize` isn't always available, so a missing value is treated as "can't
// tell, don't block" rather than a false rejection.
export function checkVideoLimits(asset: VideoAssetInfo, limitSeconds: number = VIDEO_LIMIT_REGULAR_SECONDS): string | null {
  if (asset.duration != null) {
    const seconds = Math.round(asset.duration / 1000);
    if (seconds > VIDEO_REJECT_ABOVE_SECONDS) {
      return `This video is ${Math.floor(seconds / 60)}m ${seconds % 60}s long. Videos over 5 minutes can't be uploaded.`;
    }
    if (seconds > limitSeconds) {
      const upsell = limitSeconds < VIDEO_LIMIT_VERIFIED_SECONDS ? ' Verified members can upload up to 1 minute.' : '';
      return `This video is ${seconds}s long. You can upload videos up to ${limitSeconds} seconds.${upsell} Trim it in your gallery first, then pick it again.`;
    }
  }
  if (asset.fileSize != null && asset.fileSize > VIDEO_MAX_SIZE_BYTES) {
    return `This file is ${(asset.fileSize / 1024 / 1024).toFixed(1)}MB — the limit is ${VIDEO_MAX_SIZE_BYTES / 1024 / 1024}MB.`;
  }
  return null;
}

// What the screens call: looks up the person's limit, then checks the video.
export async function checkVideoForUser(asset: VideoAssetInfo, userId?: string | null): Promise<string | null> {
  return checkVideoLimits(asset, await getVideoLimitSeconds(userId));
}

// Too long for the person's limit, but short enough (under 5 minutes) that
// trimming it down is the way forward instead of refusing it.
export function canTrimToFit(asset: VideoAssetInfo, limitSeconds: number): boolean {
  if (asset.duration == null) return false;
  const seconds = asset.duration / 1000;
  return seconds > limitSeconds && seconds <= VIDEO_REJECT_ABOVE_SECONDS;
}
