import { SITE_URL } from '@/lib/siteConfig';
import { BUNDLED } from '@/lib/emojiBundle';

// Where the 3D emoji pictures come from. One picture per emoji, named by its
// Unicode codes, at least 4 characters each, joined by "-" (a grinning face is
// "1f600.webp", a red heart "2764-fe0f.webp", the copyright sign "00a9-fe0f.webp").
// The pictures live on your own website (public/emoji) and, as a back-up, on a
// public copy of the same package. If none can be loaded, the phone's own emoji is
// shown instead, so nothing ever goes blank.
export const EMOJI_STYLE_ON = true;
// Counters shown in the emoji tray while we find out why pictures do not load.
export const emojiStats = { ok: 0, fail: 0, last: '' };
// The 3D picture emoji are switched OFF: the phone's own emoji are used everywhere.
// (Set to true to turn the picture emoji back on.)
export const USE_CUSTOM_EMOJI = false;

export const EMOJI_BASES = [SITE_URL.replace(/\/$/, '') + '/emoji/', 'https://cdn.jsdelivr.net/npm/@lobehub/fluent-emoji-3d@1.1.0/assets/'];

const hex = (c: number) => c.toString(16).padStart(4, '0');

// The file names to try, best first.
export function names(emoji: string): string[] {
  const cps = Array.from(emoji).map((ch) => ch.codePointAt(0) || 0);
  const plain = cps.filter((c) => c !== 0xfe0f);
  const asTyped = cps.map(hex).join('-');
  const stripped = plain.map(hex).join('-');
  // Single characters are often stored with the invisible "fe0f" marker after them.
  const withMarker = plain.length === 1 ? hex(plain[0]) + '-fe0f' : plain.map(hex).join('-fe0f-') ;
  const out: string[] = [];
  for (const n of [asTyped, stripped, withMarker]) if (n && !out.includes(n)) out.push(n);
  return out;
}

export function emojiUrls(emoji: string): string[] {
  if (!EMOJI_STYLE_ON || !emoji) return [];
  const list = names(emoji);
  const out: string[] = [];
  for (const base of EMOJI_BASES) for (const n of list) out.push(base + n + '.webp');
  return out;
}

// A picture that is built into the app, if this emoji is one of the essentials.
export function bundledSource(emoji: string): number | null {
  for (const n of names(emoji)) if (BUNDLED[n]) return BUNDLED[n];
  return null;
}

// Emoji whose pictures are on this phone already (no flash when a list scrolls back)
// and emoji that have no picture anywhere (drawn as normal text, never retried).
export const loadedUrls = new Set<string>();
export const missingEmoji = new Set<string>();
