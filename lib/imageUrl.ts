// Asks Cloudflare to send a smaller copy of an image instead of the
// original. Uploaded photos are stored full-size (up to ~1280px since the
// last update, far bigger before that); the feed only needs ~400px of it.
// Cloudflare resizes on its servers, caches the result, and serves modern
// WebP/AVIF where the phone supports it.
//
// It only works once "Image Transformations" is switched on for the domain
// the pictures are served from (see the setup steps in the chat). Until then
// — or if that domain can't do it — the first failed request flips a switch
// (markCdnBroken) and every image falls back to its original URL, so nothing
// ever shows up blank because of this.

// Folders the webapp/app upload into (see the upload route's allow-list).
// Animated stickers live outside this list on purpose: resizing would freeze them.
import { MEDIA_URL } from './siteConfig';

const R2_FOLDERS = /^\/(avatars|posts|messages|groups|reels|store|ads|stories|comments|chats)\//;
// A handful of fixed widths, not exact ones: Cloudflare counts each unique
// size as a separate transformation, and phones that round to the same
// bucket then share one cached copy.
const WIDTH_BUCKETS = [160, 320, 480, 720, 1080];

// The custom domain connected to the R2 bucket, with Image Transformations on.
const MEDIA_ORIGIN = MEDIA_URL;

// Pictures that lived on an old storage project that no longer serves files
// (it answers "402 Payment Required"). They are never requested, so the app
// shows its normal empty state instead of retrying a dead address.
const DEAD_HOSTS = ['qjhxvefwsexlalxpkbps.supabase.co'];
export function isDeadMedia(url: string | undefined | null): boolean {
  return !!url && DEAD_HOSTS.some((h) => url.includes(h));
}

let cdnBroken = false;
export function markCdnBroken() {
  cdnBroken = true;
}

export function optimizedUrl(url: string | undefined | null, targetPx: number): string | undefined {
  if (!url || isDeadMedia(url)) return undefined;
  if (cdnBroken || !/^https:\/\//i.test(url) || url.includes('/cdn-cgi/')) return url;
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return url;
  }
  if (!R2_FOLDERS.test(u.pathname)) return url;
  if (/\.(gif|svg|mp4|mov|webm|m4a|mp3)$/i.test(u.pathname)) return url;
  const width = WIDTH_BUCKETS.find((b) => b >= targetPx) ?? WIDTH_BUCKETS[WIDTH_BUCKETS.length - 1];
  // Always go through the media domain, even for pictures saved with the old
  // storage address: it's the same bucket, so the same file path works on
  // both, and only this domain can resize.
  return `${MEDIA_ORIGIN}/cdn-cgi/image/width=${width},quality=75,format=auto${u.pathname}`;
}
